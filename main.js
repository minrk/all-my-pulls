function getNextPage(linksHeader) {
  // from github.js Requestable.js
  var links = linksHeader.split(/\s*,\s*/); // splits and strips the urls
  
  return links.reduce(function(nextUrl, link) {
    if (link.search(/rel\s*=\s*"next"/) !== -1) {
      return (link.match(/<(.*)>/) || [])[1];
    }
    return nextUrl;
  }, undefined);
}


var PullRequest = React.createClass({
  displayName: 'PullRequest',
  render: function() {
    var updated = moment(this.props.data.updated_at).fromNow();
    var created = moment(this.props.data.created_at).fromNow();
    return (
      <div className="row pull-request">
        <a href={this.props.data.html_url} className="pr-link col-xs-12">
          <div className="row">
            <div className='pr-title col-xs-12'>{this.props.data.title}</div>
          </div>
          <div className="row">
            <div className='pr-subtitle col-xs-12'>
              #{this.props.data.number}
              { " " }
              opened {created}
              { " " }
              by @{this.props.data.user.login}
              <br/>
              Updated {updated}
            </div>
          </div>
        </a>
      </div>
    )
  },
});


var PullRequestList = React.createClass({
  displayName: 'PullRequestList',
  render: function() {
    var that = this;
    var prNodes = this.props.data.map(function (pr_data) {
      return (
        <PullRequest key={pr_data.id} data={pr_data} github={github} />
      )
    });
    return (
      <div className="prList">
        {prNodes}
      </div>
    )
  }
});


var Repo = React.createClass({
  displayName: 'Repo',
  getInitialState: function() {
    return {
      pulls: [],
      css_classes: 'hidden',
    };
  },
  componentDidMount: function() {
    this.loadPulls();
  },
  render: function() {
    return (
      <div className="row">
      <div className={this.state.css_classes + ' repo'}>
      <div className="repo-title">
      {this.props.data.full_name}
      </div>
      <PullRequestList github={this.props.github} data={this.state.pulls} />
      </div>
      </div>
    )
  },
  loadPulls: function () {
    var that = this;
    this.props.github.getRepo(this.props.data.full_name).listPullRequests().then(function(resp) {
      that.setState({
        pulls: resp.data,
        css_classes: resp.data.length === 0 ? 'hidden' : '',
      })
    })
  }
});

var RepoList = React.createClass({
  displayName: 'RepoList',
  render: function() {
    var repoNodes = this.props.data.map(function (repo_data) {
      // skip those with no issues
      if (repo_data.open_issues_count === 0) return;
      // skip those I can't push to (missing the point!)
      if (!repo_data.permissions.push) return;
      
      return (
        <Repo key={repo_data.full_name} data={repo_data} github={github} />
      )
    });
    // filter out undefined
    repoNodes = repoNodes.filter(function (data) {
      return (data !== undefined);
    });
    return (
      <div className='row'>
      <div className="repoList col-xs-12">
      {repoNodes}
      </div>
      </div>
    )
  }
});


var User = React.createClass({
  displayName: 'User',
  getInitialState: function() {
    return {
      repos: [],
      profile: {},
    };
  },
  componentDidMount: function() {
    window.props = this.props;
    this.loadProfile();
    this.loadRepos();
  },
  render: function() {
    return (
      <div className="user">
        Showing all pull requests mergeable by
      <span className="username">
      {" "} @{this.state.profile.login}
      </span>
      <RepoList data={this.state.repos} github={github} />
      </div>
    )
  },
  loadProfile: function () {
    var that = this;
    this.props.user.getProfile().then(function (profile) {
      that.setState({
        profile: profile.data
      });
    });
  },
  loadRepos: function() {
    var that = this;
    // use paged request to load data piecemeal
    // this is based on github.js _requestAllPages
    var user = this.props.user;
    function handleMoreRepos(resp) {
      if (resp.headers.link !== undefined) {
        var nextUrl = getNextPage(resp.headers.link);
        if (nextUrl) {
          user._request('GET', nextUrl).then(handleMoreRepos);
        }
      }
      that.setState({
        repos: that.state.repos.concat(resp.data)
      });
    }
    user._request('GET', '/user/repos').then(handleMoreRepos);
  },
});


var RateLimit = React.createClass({
  displayName: 'RateLimit',
  render: function() {
    var reset_date = (new Date(this.props.data.rate.reset * 1000)).toLocaleString();
    return (
      <div className="row">
        <h2 className="rate-limit-error col-xs-12">
        Rate limit exceeded! Try again after {reset_date}.
        </h2>
      </div>
    )
  },
});


var code_match = window.location.href.match(/\?code=(.*)/);
if (!code_match) {
  window.location = "https://github.com/login/oauth/authorize?scope=read:org&client_id=19277e98ad9400d0133b&redirect_uri=" + window.location;
} else {
  var code = code_match[1];
  // scrub OAuth code from URL
  window.history.replaceState("not sure", "All My Pulls", window.location.pathname);
  
  // request OAuth token
  $.getJSON('https://minrk-github-oauth.herokuapp.com/authenticate/' + code, function(data) {
    // create GitHub client
    var github = window.github = new GitHub({
      token: data.token
    });
    
    // check rateLimit, then proceed
    github.getRateLimit().getRateLimit().then(function(resp) {
      console.log('API limit remaining: ' + resp.data.rate.remaining);
      // date constructor takes epoch milliseconds and we get epoch seconds
      if (resp.data.rate.remaining === 0) {
        // don't burn the rate limit
        ReactDOM.render(
          <RateLimit data={resp.data} />,
          document.getElementById('content')
        );
        return;
      }

      var user = github.getUser();
      ReactDOM.render(
        <User github={github} user={user} data={data}/>,
        document.getElementById('content')
      );
    }).catch(function(error) {
        console.log('Error fetching rate limit', error.message);
    });
  });
}